import { resolveApp } from "@laconic/utils";
import fs from "fs-extra";
import { execSync, exec } from "child_process";
import { confirm, intro, select } from "@clack/prompts";
import chalk from "chalk";
import { join } from "path";
import ora from "ora";

import { removeDirectory, getNpmPackage } from "./fileController";
import { ProjectTypes, PackageManagers } from "./questions";
import { projectLink } from "./constants";
import isGitInstalled from "./gitCheck";
import createSuccessInfo from "./createSuccessInfo";
import createCommitlint from "./createCommitlint";
import { createPackageJson, createTemplateFile } from "./createFile";

// 设置输入模式为原始模式
process.stdin.setRawMode(true);

// Ctrl+C 退出时打印的提示信息
const exitMsg: string = "⌨️  Ctrl+C pressed - Exiting the program";

// 监听键盘输入，避免选择阶段需要多次 Ctrl+C 退出
process.stdin.on("data", (key) => {
  // 检测到 Ctrl+C
  if (key[0] === 3) {
    console.log(exitMsg);
    process.exit(1);
  }
});

// 这里的监听是为了：当用户输入完预设，此时项目文件夹已经创建并且在下载依赖，
// 这时如果用户使用 Ctrl+C 终止了程序，那么清理掉初始化一半的文件夹
process.on("SIGINT", () => {
  console.log("\n" + exitMsg);
  removeDirectory(rootDirectory, true);
  process.exit(1);
});

// 创建项目文件
const makeDirectory = async (matter, options) => {
  const rootDirectory = resolveApp(matter);
  // 如果存在同名文件,且没有输入 -f,
  if (fs.existsSync(rootDirectory) && !options.force) {
    const shouldContinue = await confirm({
      message:
        "Whether to overwrite a file with the same name that exists in the current directory ?",
    });

    // 删除已存在文件并创建新文件
    if (shouldContinue === true) {
      removeDirectory(matter, true);
    } else process.exit(1);
  }

  execSync(`mkdir ${rootDirectory}`);
};

// 获取表单结果
const getTableInfo = async () => {
  const projectType = (await select({
    message: "Pick a project type.",
    options: ProjectTypes,
  })) as string;

  const packageManageType = (await select({
    message: "Select the package management tool you will use:",
    options: PackageManagers,
  })) as string;

  const commitLint = (await confirm({
    message: "Pick additional lint features:",
  })) as boolean;

  return { projectType, packageManageType, commitLint };
};

// rootDirectory 由 create-neat 所在的系统根目录和用户输入的文件夹名称拼接而成
let rootDirectory: string;

// 模板创建主函数
export default async function createApp(matter: string, options: { force: boolean; dev: boolean }) {
  intro(chalk.green(" create-you-app "));
  const rootDirectory = resolveApp(matter);

  const { projectType, packageManageType, commitLint } = await getTableInfo();

  await makeDirectory(matter, options);

  // 依据 projectType 把相关模板 json 写入 package.json 文件
  fs.writeFileSync(
    join(rootDirectory, "package.json"),
    JSON.stringify(createPackageJson(projectType, matter), null, 2),
  );

  // 写入 .gitignore 文件
  fs.writeFileSync(join(rootDirectory, ".gitignore"), createTemplateFile("gitignore"));
  // 下载 npm 包解压,获取目标模板导入文件,并删除一些无用的代码文件
  getNpmPackage(projectLink.get(projectType) as string, projectType, rootDirectory, options.dev);

  // 注入 commitlint 规则
  if (commitLint === true) {
    createCommitlint(rootDirectory);
  }

  // todo：考虑省略这一步
  // 安装相关依赖
  const spinner = ora().start();
  spinner.start(chalk.bold.cyan("The dependency package is being installed..."));
  exec(`${packageManageType} install`, { cwd: rootDirectory }, () => {
    spinner.succeed(chalk.bold.green("🚀 Project initialization is complete"));

    createSuccessInfo(matter, packageManageType);
  });

  // 是否安装已经安装了 git
  if (isGitInstalled(rootDirectory)) {
    exec("git init", { cwd: rootDirectory });
  }
}

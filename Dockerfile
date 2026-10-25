# D1–D2六步基础复现镜像；尚未实跑，桌面LCEDA/DRC不在容器范围。
FROM node:20-alpine
WORKDIR /app

# 顶层核心链路无第三方npm依赖，不运行npm install。
# 白名单COPY与.dockerignore共同排除私有文档、证据/SDK副本和旧产物。
COPY package.json LICENSE README.md ./
COPY src/ ./src/
COPY contracts/ ./contracts/
COPY test/ ./test/
COPY scripts/reproduce.js ./scripts/reproduce.js
COPY vendor/easyeda-eprj3-skill/ ./vendor/easyeda-eprj3-skill/
COPY vendor/easyeda-format-skill/ ./vendor/easyeda-format-skill/
COPY ["docs/复现指南.md", "docs/verification.md", "./docs/"]

# 镜像只承诺此复现入口的预期范围，其他桌面/打包命令不在容器范围。
# 静态依赖闭包不证明Node20/Linux tar及ZIP输出已在容器通过。
CMD ["node", "scripts/reproduce.js"]

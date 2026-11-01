# 这部分是数据库资料和导入工具，不是一个正在运行的数据库

随包带同一份已实测的“公开派生版”资料：13条来源、1条U4→BME280来源事实关系，6器件/4参考/3文档，模块/项目/验证运行表没有输入，不伪造记录。

本版指纹3905f2810dd47e8676859f0269fd803f254932beceeabca3c50cdd632759a546。它不是原始v5指纹9d0fd2...a0657，不是原始PostgreSQL完整数据转储，也不带原52附件。库里仅有自写的U4事实摘要JSON，不含原Eagle/PDF或实测日志。原始资源unknown/none许可不改成MIT。前端的许可明确Adafruit工程在前端assets内，和这个公开元数据库是两部分。

## 客户先看什么
打开“资料一览.html”看13条清单。它是固定资料表，不是在线SQL查询；前端也不实时查询PG。已有PG17.6专用空库import/verify均exit0，13/1和严格表/版本/关系回查一致，已停库，摘要见已实测范围.json。这个事实不证明客户电脑已安装或启动PG。

## 最简单的本地检查
在交付包根目录执行npm test。会逐文件核验包、重生成SQL比较、在数据库目录运行原10项测试；不启动数据库、不改现有PG库。

## 要自己导入PostgreSQL时
自行安装PostgreSQL/psql并配置本机认证，先建一个专用新空库；不要用现有业务库。复制config.example.json为客户自己保存的local配置并填真实绝对psql路径、用户和高端口。示例没有密码，实际配置不要回传或公开。脚本拒绝非127.0.0.1、普通库名、低端口、密码字段和已有hg_lib03 schema，不覆盖。

从包根执行（把CONFIG和全新OUT换成你自己的位置）：
```text
node 数据库/scripts/lib03-postgres.js import CONFIG 数据库/library OUT
node 数据库/scripts/lib03-postgres.js verify CONFIG 数据库/library ANOTHER_NEW_OUT
```
OUT都必须是尚不存在的新目录。成功为exit0、valid:true、13sources/1link；如果失败保留原日志，不删旧库。认证由客户自己管理；本包不提供、收集或代填凭据。运行日志可能有客户本机路径，不能自动转公开。

四个最小脚本与两个测试保留原字节。没有附library-index/library CLI，不宣称其动态CLI可用；这里只使用scanLibrary/generate和PG import/verify入口。未带PG二进制、SDK、配置或数据目录，无npm外部依赖。

lib03-public-demo.js是提供原库到公开派生版的生成源码，原库不随包，不是本包必跑命令；直接使用随包已固定的library和SQL，不要二次派生冒充同一版本。

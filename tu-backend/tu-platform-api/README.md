# tu-platform-api

tu-backend 对外发布的 **Dubbo RPC 契约**（接口 + DTO），供 StudyFlow 等下游服务依赖。

- Maven：`com.tu:tu-platform-api`
- 包名：`com.tu.platform.api`

构建（在 `tu-backend` 根目录）：

```powershell
mvn install -pl tu-platform-api -am -DskipTests
```

studyflow-service 依赖此 jar，**无需**单独 `studyflow-api` 仓库。

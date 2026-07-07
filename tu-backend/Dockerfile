FROM maven:3.9-eclipse-temurin-25 AS builder

WORKDIR /app

COPY pom.xml ./
COPY tu-platform-api ./tu-platform-api
COPY tu-backend-app ./tu-backend-app

RUN mvn -q -DskipTests package -pl tu-backend-app -am

FROM eclipse-temurin:25-jre

WORKDIR /app

COPY --from=builder /app/tu-backend-app/target/*.jar /app/tu-backend.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/tu-backend.jar"]

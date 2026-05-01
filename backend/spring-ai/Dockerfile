FROM docker.m.daocloud.io/library/eclipse-temurin:25-jdk-noble AS builder
WORKDIR /app
COPY pom.xml pom.xml
COPY mvnw mvnw
COPY .mvn .mvn
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B -q
COPY src src
RUN ./mvnw package -DskipTests -B -q

FROM docker.m.daocloud.io/library/eclipse-temurin:25-jre-noble
ARG IM_BUILD_NONCE
LABEL im.build.nonce=$IM_BUILD_NONCE
RUN useradd -r -u 10001 appuser
WORKDIR /app
COPY --from=builder /app/target/spring-ai-im-*.jar app.jar
USER appuser
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "app.jar"]

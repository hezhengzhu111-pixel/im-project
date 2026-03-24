FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY target/*.jar app.jar
EXPOSE 8086
ENV JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true -Djava.net.preferIPv4Addresses=true"
ENTRYPOINT ["java", "-jar", "app.jar"]
ARG IM_BUILD_NONCE
LABEL im.build.nonce=$IM_BUILD_NONCE

package com.im.architecture;

import org.junit.jupiter.api.Test;

import javax.xml.parsers.DocumentBuilderFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class ModuleIsolationPomTest {

    @Test
    void serviceModulesShouldNotDependOnOtherBusinessModules() throws Exception {
        Path backendDir = Path.of("..").toAbsolutePath().normalize();
        assertThat(backendDir.getFileName().toString()).isEqualTo("backend");

        Set<String> businessArtifacts = Set.of(
                "im-gateway",
                "im-user-service",
                "im-group-service",
                "im-message-service",
                "im-file-service",
                "im-server"
        );

        Set<String> violations = new HashSet<>();

        for (String module : businessArtifacts) {
            String moduleDir = "im-server".equals(module) ? "im-server" : module.replace("im-", "");
            Path pomPath = backendDir.resolve(moduleDir).resolve("pom.xml");
            if (!Files.exists(pomPath)) {
                continue;
            }

            var doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(pomPath.toFile());
            var deps = doc.getElementsByTagName("dependency");
            for (int i = 0; i < deps.getLength(); i++) {
                var dep = deps.item(i);
                var children = dep.getChildNodes();
                String groupId = null;
                String artifactId = null;
                for (int j = 0; j < children.getLength(); j++) {
                    var n = children.item(j);
                    if (n.getNodeType() != org.w3c.dom.Node.ELEMENT_NODE) {
                        continue;
                    }
                    if ("groupId".equals(n.getNodeName())) {
                        groupId = n.getTextContent().trim();
                    }
                    if ("artifactId".equals(n.getNodeName())) {
                        artifactId = n.getTextContent().trim();
                    }
                }

                if (!"com.im".equals(groupId) || artifactId == null) {
                    continue;
                }
                if ("im-common".equals(artifactId)) {
                    continue;
                }
                if (businessArtifacts.contains(artifactId)) {
                    violations.add(module + " -> " + artifactId);
                }
            }
        }

        assertThat(violations)
                .as("业务模块不得直接依赖其他业务模块（只允许依赖 im-common）")
                .isEmpty();
    }
}

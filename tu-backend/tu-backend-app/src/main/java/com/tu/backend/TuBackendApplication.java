package com.tu.backend;

import com.tu.backend.index.IndexProperties;
import com.tu.backend.rag.RagProperties;
import com.tu.backend.search.SearchProperties;
import com.tu.backend.secret.SecretProperties;
import com.tu.backend.storage.FileStorageProperties;
import com.tu.backend.taskintegration.IntegrationProperties;
import org.apache.dubbo.config.spring.context.annotation.EnableDubbo;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableDiscoveryClient
@EnableDubbo(scanBasePackages = "com.tu.backend.platform.dubbo")
@EnableScheduling
@EnableConfigurationProperties({RagProperties.class, IntegrationProperties.class, SecretProperties.class, SearchProperties.class, IndexProperties.class, FileStorageProperties.class})
public class TuBackendApplication {

    public static void main(String[] args) {
        // Dubbo 3.3.6 + JDK 25: prefer fastjson2 (transitive from dubbo); optional SPI libs on classpath.
        System.setProperty("dubbo.json-framework.prefer", "fastjson2");
        SpringApplication.run(TuBackendApplication.class, args);
    }
}

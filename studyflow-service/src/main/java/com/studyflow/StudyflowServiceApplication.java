package com.studyflow;

import org.apache.dubbo.config.spring.context.annotation.EnableDubbo;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@EnableDubbo
public class StudyFlowServiceApplication {

    public static void main(String[] args) {
        // Nacos client's built-in logback rolling uses a fixed file + rename; on Windows
        // that fails when the file is locked (often by multiple local processes).
        // Route Nacos logs through the app logger instead.
        System.setProperty("nacos.logging.default.config.enabled", "false");
        SpringApplication.run(StudyFlowServiceApplication.class, args);
    }
}

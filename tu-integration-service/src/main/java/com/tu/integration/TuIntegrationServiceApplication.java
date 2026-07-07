package com.tu.integration;

import com.tu.integration.kaneo.KaneoProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication
@EnableDiscoveryClient
@EnableConfigurationProperties(KaneoProperties.class)
public class TuIntegrationServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(TuIntegrationServiceApplication.class, args);
    }
}

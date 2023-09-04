package com.run.tu;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * @author ronger
 */
@EnableAsync
@SpringBootApplication
public class TuApplication {

    public static void main(String[] args) {
        SpringApplication.run(TuApplication.class, args);
    }

}

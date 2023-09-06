package org.zhitui.tu;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * @author Tina_Run
 */
@EnableAsync
@SpringBootApplication
public class TuApplication {

    public static void main(String[] args) {
        SpringApplication.run(TuApplication.class, args);
    }

}

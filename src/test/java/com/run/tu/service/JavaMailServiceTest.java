package com.run.tu.service;

import com.run.tu.base.BaseServiceTest;
import com.run.tu.dto.NotificationDTO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import javax.mail.MessagingException;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * javaMail测试
 */
class JavaMailServiceTest extends BaseServiceTest {

    private static final String REALITY_EMAIL = "1421374934@qq.com";
    @Autowired
    private JavaMailService javaMailService;

//    @Test
//    void sendEmailCode() throws MessagingException {
//        assertEquals(1, javaMailService.sendEmailCode(REALITY_EMAIL));
//    }
//
//    @Test
//    void sendForgetPasswordEmail() throws MessagingException {
//        assertEquals(1, javaMailService.sendForgetPasswordEmail(REALITY_EMAIL));
//    }

    @Test
    void sendNotification() throws MessagingException {
        assertEquals(0, javaMailService.sendNotification(new NotificationDTO()));

    }
}

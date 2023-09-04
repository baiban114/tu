package com.run.tu.dto;


import com.run.tu.entity.Notification;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * @author ronger
 */
@Data
@EqualsAndHashCode(callSuper = false)
public class NotificationDTO extends Notification {

    private Long idNotification;

    private String dataTitle;

    private String dataUrl;

    private Author author;

}

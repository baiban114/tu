package org.zhitui.tu.entity;


import lombok.Data;

import javax.persistence.Id;
import javax.persistence.Table;

/**
 * @author ronger
 */
@Data
@Table(name = "tu_user_extend")
public class UserExtend {

    @Id
    private Long idUser;

    private String github;

    private String weibo;

    private String weixin;

    private String qq;

    private String blog;

}

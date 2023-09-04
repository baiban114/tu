package com.run.tu.dto;

import lombok.Data;

/**
 * Created on 2023/7/26 10:20.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @desc : com.run.tu.dto
 */
@Data
public class ArticleUpdateStatusDTO {

    private Long idArticle;

    private String articleStatus;

    private String remarks;

}

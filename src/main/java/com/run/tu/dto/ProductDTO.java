package com.run.tu.dto;

import com.run.tu.entity.Product;
import lombok.Data;

/**
 * Created on 2022/6/21 9:38.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @packageName com.run.tu.dto
 */
@Data
public class ProductDTO extends Product {
    /**
     * 文章内容
     */
    private String productContent;
    /**
     * 文章内容html
     */
    private String productContentHtml;
}

package org.zhitui.tu.mapper;

import org.zhitui.tu.core.mapper.Mapper;
import org.zhitui.tu.dto.ProductDTO;
import org.zhitui.tu.entity.Product;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * Created on 2022/6/13 21:53.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 */
public interface ProductMapper extends Mapper<Product> {
    /**
     * 保存产品详情
     *
     * @param idProduct
     * @param productContent
     * @param productContentHtml
     * @return
     */
    Integer insertProductContent(@Param("idProduct") Integer idProduct, @Param("productContent") String productContent, @Param("productContentHtml") String productContentHtml);

    /**
     * 查询产品列表
     *
     * @return
     */
    List<ProductDTO> selectProducts();

    /**
     * 获取产品详情
     *
     * @param idProduct
     * @param type
     * @return
     */
    ProductDTO selectProductDTOById(@Param("idProduct") Integer idProduct, @Param("type") Integer type);
}

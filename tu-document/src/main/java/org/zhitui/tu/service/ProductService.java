package org.zhitui.tu.service;

import org.zhitui.tu.core.service.Service;
import org.zhitui.tu.dto.ProductDTO;
import org.zhitui.tu.entity.Product;

import java.util.List;

/**
 * Created on 2022/6/21 9:25.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @packageName org.zhitui.tu.service
 */
public interface ProductService extends Service<Product> {
    /**
     * 查询产品列表
     *
     * @return
     */
    List<ProductDTO> findProducts();

    /**
     * 获取产品详情
     *
     * @param idProduct
     * @param type
     * @return
     */
    ProductDTO findProductDTOById(Integer idProduct, Integer type);
}

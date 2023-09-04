package com.run.tu.service;

import com.run.tu.core.service.Service;
import com.run.tu.dto.ProductDTO;
import com.run.tu.entity.Product;

import java.util.List;

/**
 * Created on 2022/6/21 9:25.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @packageName com.run.tu.service
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

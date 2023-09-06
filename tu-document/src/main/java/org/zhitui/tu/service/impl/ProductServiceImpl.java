package org.zhitui.tu.service.impl;

import org.zhitui.tu.core.service.AbstractService;
import org.zhitui.tu.dto.ProductDTO;
import org.zhitui.tu.entity.Product;
import org.zhitui.tu.mapper.ProductMapper;
import org.zhitui.tu.service.ProductService;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.List;

/**
 * Created on 2022/6/21 9:26.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @packageName org.zhitui.tu.service.impl
 */
@Service
public class ProductServiceImpl extends AbstractService<Product> implements ProductService {

    @Resource
    private ProductMapper productMapper;

    @Override
    public List<ProductDTO> findProducts() {
        return productMapper.selectProducts();
    }

    @Override
    public ProductDTO findProductDTOById(Integer idProduct, Integer type) {
        ProductDTO productDTO = productMapper.selectProductDTOById(idProduct, type);
        return productDTO;
    }
}

package com.run.tu.service.impl;

import com.run.tu.core.service.AbstractService;
import com.run.tu.dto.ProductDTO;
import com.run.tu.entity.Product;
import com.run.tu.mapper.ProductMapper;
import com.run.tu.service.ProductService;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.List;

/**
 * Created on 2022/6/21 9:26.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @packageName com.run.tu.service.impl
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

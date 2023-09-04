package com.run.tu.lucene.mapper;

import com.run.tu.dto.PortfolioDTO;
import com.run.tu.lucene.model.PortfolioLucene;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * PortfolioLuceneMapper
 *
 * @author suwen
 * @date 2021/4/17 10:00
 */
@Mapper
public interface PortfolioLuceneMapper {

    /**
     * 加载所有作品集信息
     *
     * @return
     */
    List<PortfolioLucene> getAllPortfolioLucene();

    /**
     * 加载所有作品集信息
     *
     * @param ids 作品集id(半角逗号分隔)
     * @return
     */
    List<PortfolioDTO> getPortfoliosByIds(@Param("ids") Long[] ids);

    /**
     * 加载作品集
     *
     * @param id 用户id
     * @return
     */
    PortfolioLucene getById(@Param("id") Long id);
}

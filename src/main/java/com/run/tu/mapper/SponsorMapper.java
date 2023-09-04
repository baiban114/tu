package com.run.tu.mapper;

import com.run.tu.core.mapper.Mapper;
import com.run.tu.entity.Sponsor;
import org.apache.ibatis.annotations.Param;

/**
 * @author ronger
 */
public interface SponsorMapper extends Mapper<Sponsor> {
    /**
     * 更新文章赞赏数
     *
     * @param idArticle
     * @return
     */
    Integer updateArticleSponsorCount(@Param("idArticle") Long idArticle);
}

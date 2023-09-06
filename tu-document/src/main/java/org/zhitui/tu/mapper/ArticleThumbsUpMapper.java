package org.zhitui.tu.mapper;

import org.zhitui.tu.core.mapper.Mapper;
import org.zhitui.tu.entity.ArticleThumbsUp;
import org.apache.ibatis.annotations.Param;

/**
 * @author ronger
 */
public interface ArticleThumbsUpMapper extends Mapper<ArticleThumbsUp> {
    /**
     * 更新文章点赞数
     *
     * @param idArticle
     * @param thumbsUpNumber
     * @return
     */
    Integer updateArticleThumbsUpNumber(@Param("idArticle") Long idArticle, @Param("thumbsUpNumber") Integer thumbsUpNumber);
}

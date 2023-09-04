package com.run.tu.service;

import com.run.tu.base.BaseServiceTest;
import com.run.tu.core.exception.BusinessException;
import com.run.tu.dto.ArticleDTO;
import com.run.tu.dto.ArticleSearchDTO;
import com.run.tu.entity.ArticleThumbsUp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Date;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 点赞文章测试
 *
 * @author 毛毛虫
 */
class ArticleThumbsUpServiceTest extends BaseServiceTest {

    /**
     * 测试用点赞实体
     */
    private final ArticleThumbsUp articleThumbsUp;

    @Autowired
    private ArticleThumbsUpService articleThumbsUpService;
    @Autowired
    private ArticleService articleService;

    {
            articleThumbsUp = new ArticleThumbsUp();
            articleThumbsUp.setIdArticle(-1L);
            articleThumbsUp.setThumbsUpTime(new Date());
            articleThumbsUp.setIdUser(-1L);
    }


    /**
     * 测试点赞不存在的文章
     */
    @Test
    public void thumbsNotExistsArticle() {
        assertThrows(BusinessException.class, () -> {
            articleThumbsUpService.thumbsUp(articleThumbsUp);
        });
    }

    /**
     * 测试点赞存在的文章
     */
    @Test
    public void thumbsExistsArticle2() {
        assertDoesNotThrow(() -> {
            ArticleSearchDTO articleSearchDTO = new ArticleSearchDTO();
            articleSearchDTO.setTopicUri("news");
            List<ArticleDTO> articles = articleService.findArticles(articleSearchDTO);
            articleThumbsUp.setIdArticle(articles.get(0).getIdArticle());
        });

        int i = articleThumbsUpService.thumbsUp(articleThumbsUp);
        assertEquals(1, i);
    }

}
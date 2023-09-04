package com.run.tu.service;

import com.run.tu.core.service.Service;
import com.run.tu.entity.ArticleThumbsUp;

/**
 * 点赞
 *
 * @author ronger
 */
public interface ArticleThumbsUpService extends Service<ArticleThumbsUp> {
    /**
     * 点赞
     *
     * @param articleThumbsUp
     * @return
     */
    int thumbsUp(ArticleThumbsUp articleThumbsUp);
}

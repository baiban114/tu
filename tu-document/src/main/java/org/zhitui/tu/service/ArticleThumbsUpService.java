package org.zhitui.tu.service;

import org.zhitui.tu.core.service.Service;
import org.zhitui.tu.entity.ArticleThumbsUp;

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

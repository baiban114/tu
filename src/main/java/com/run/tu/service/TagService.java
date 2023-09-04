package com.run.tu.service;

import com.run.tu.core.service.Service;
import com.run.tu.dto.LabelModel;
import com.run.tu.entity.Article;
import com.run.tu.entity.Tag;

import java.io.UnsupportedEncodingException;
import java.util.List;

/**
 * @author ronger
 */
public interface TagService extends Service<Tag> {

    /**
     * 保存文章标签
     *
     * @param article
     * @param articleContentHtml
     * @param userId
     * @return
     * @throws UnsupportedEncodingException
     */
    Integer saveTagArticle(Article article, String articleContentHtml, Long userId) throws UnsupportedEncodingException;

    /**
     * 清除未使用标签
     *
     * @return
     */
    boolean cleanUnusedTag();

    /**
     * 添加/更新标签
     *
     * @param tag
     * @return
     */
    Tag saveTag(Tag tag) throws Exception;

    /**
     * 获取标签列表
     *
     * @return
     */
    List<LabelModel> findTagLabels();
}

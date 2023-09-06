package org.zhitui.tu.service;

import org.zhitui.tu.core.service.Service;
import org.zhitui.tu.dto.LabelModel;
import org.zhitui.tu.entity.Article;
import org.zhitui.tu.entity.Tag;

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

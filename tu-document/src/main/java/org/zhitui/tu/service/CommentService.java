package org.zhitui.tu.service;

import org.zhitui.tu.core.service.Service;
import org.zhitui.tu.dto.CommentDTO;
import org.zhitui.tu.entity.Comment;

import javax.servlet.http.HttpServletRequest;
import java.util.List;

/**
 * @author ronger
 */
public interface CommentService extends Service<Comment> {

    /**
     * 获取文章评论数据
     *
     * @param idArticle
     * @return
     */
    List<CommentDTO> getArticleComments(Integer idArticle);

    /**
     * 评论
     *
     * @param comment
     * @param request
     * @return
     */
    Comment postComment(Comment comment, HttpServletRequest request);

    /**
     * 获取评论列表数据
     *
     * @return
     */
    List<CommentDTO> findComments();
}

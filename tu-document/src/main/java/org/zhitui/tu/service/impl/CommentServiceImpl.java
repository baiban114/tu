package org.zhitui.tu.service.impl;

import org.zhitui.tu.core.exception.ContentNotExistException;
import org.zhitui.tu.core.service.AbstractService;
import org.zhitui.tu.dto.Author;
import org.zhitui.tu.dto.CommentDTO;
import org.zhitui.tu.entity.Article;
import org.zhitui.tu.entity.Comment;
import org.zhitui.tu.handler.event.CommentEvent;
import org.zhitui.tu.mapper.CommentMapper;
import org.zhitui.tu.service.ArticleService;
import org.zhitui.tu.service.CommentService;
import org.zhitui.tu.util.Utils;
import org.zhitui.tu.util.XssUtils;
import org.apache.commons.lang.StringUtils;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.util.Date;
import java.util.List;

/**
 * @author ronger
 */
@Service
public class CommentServiceImpl extends AbstractService<Comment> implements CommentService {

    @Resource
    private CommentMapper commentMapper;
    @Resource
    private ArticleService articleService;
    @Resource
    private ApplicationEventPublisher applicationEventPublisher;

    @Override
    public List<CommentDTO> getArticleComments(Integer idArticle) {
        List<CommentDTO> commentDTOList = commentMapper.selectArticleComments(idArticle);
        return genComments(commentDTOList);
    }

    private List<CommentDTO> genComments(List<CommentDTO> commentDTOList) {
        commentDTOList.forEach(commentDTO -> {
            commentDTO.setTimeAgo(Utils.getTimeAgo(commentDTO.getCreatedTime()));
            commentDTO.setCommentContent(XssUtils.filterHtmlCode(commentDTO.getCommentContent()));
            if (commentDTO.getCommentAuthorId() != null) {
                Author author = commentMapper.selectAuthor(commentDTO.getCommentAuthorId());
                if (author != null) {
                    commentDTO.setCommenter(author);
                }
            }
            if (commentDTO.getCommentOriginalCommentId() != null && commentDTO.getCommentOriginalCommentId() > 0) {
                Author commentOriginalAuthor = commentMapper.selectCommentOriginalAuthor(commentDTO.getCommentOriginalCommentId());
                if (commentOriginalAuthor != null) {
                    commentDTO.setCommentOriginalAuthorThumbnailURL(commentOriginalAuthor.getUserAvatarURL());
                    commentDTO.setCommentOriginalAuthorNickname(commentOriginalAuthor.getUserNickname());
                }
                Comment comment = commentMapper.selectByPrimaryKey(commentDTO.getCommentOriginalCommentId());
                commentDTO.setCommentOriginalContent(comment.getCommentContent());
            }
        });
        return commentDTOList;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Comment postComment(Comment comment, HttpServletRequest request) {
        if (comment.getCommentArticleId() == null) {
            throw new IllegalArgumentException("非法访问,文章主键异常！");
        }
        if (comment.getCommentAuthorId() == null) {
            throw new IllegalArgumentException("非法访问,用户未登录！");
        }
        if (StringUtils.isBlank(comment.getCommentContent())) {
            throw new IllegalArgumentException("回帖内容不能为空！");
        }
        Article article = articleService.findById(comment.getCommentArticleId().toString());
        if (article == null) {
            throw new ContentNotExistException("文章不存在！");
        }
        String ip = Utils.getIpAddress(request);
        String ua = request.getHeader("user-agent");
        comment.setCommentIP(ip);
        comment.setCommentUA(ua);
        comment.setCreatedTime(new Date());
        comment.setCommentContent(XssUtils.filterHtmlCode(comment.getCommentContent()));
        commentMapper.insertSelective(comment);
        String commentSharpUrl = article.getArticlePermalink() + "#comment-" + comment.getIdComment();
        commentMapper.updateCommentSharpUrl(comment.getIdComment(), commentSharpUrl);

        String commentContent = comment.getCommentContent();
        if (StringUtils.isNotBlank(commentContent)) {
            applicationEventPublisher.publishEvent(new CommentEvent(comment.getIdComment(), article.getArticleAuthorId(), comment.getCommentAuthorId(), commentContent, comment.getCommentOriginalCommentId()));
        }
        return comment;
    }

    @Override
    public List<CommentDTO> findComments() {
        List<CommentDTO> commentDTOList = commentMapper.selectComments();
        return genComments(commentDTOList);
    }
}

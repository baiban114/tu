package com.run.tu.controller.comment;

import com.run.tu.core.result.GlobalResult;
import com.run.tu.core.result.GlobalResultGenerator;
import com.run.tu.entity.Comment;
import com.run.tu.service.CommentService;
import com.run.tu.util.UserUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;

/**
 * @author ronger
 */
@RestController
@RequestMapping("/api/v1/comment")
public class CommentController {

    @Resource
    private CommentService commentService;

    @PostMapping("/post")
    public GlobalResult<Comment> postComment(@RequestBody Comment comment, HttpServletRequest request) {
        comment.setCommentAuthorId(UserUtils.getCurrentUserByToken().getIdUser());
        comment = commentService.postComment(comment, request);
        return GlobalResultGenerator.genSuccessResult(comment);
    }
}

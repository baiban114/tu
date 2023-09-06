package org.zhitui.tu.handler.event;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * Created on 2022/8/17 7:43.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @packageName org.zhitui.tu.handler.event
 */
@Data
@AllArgsConstructor
public class CommentEvent {

    private Long idComment;

    private Long articleAuthorId;

    private Long commentAuthorId;

    private String content;

    private Long commentOriginalCommentId;
}

package com.run.tu.handler.event;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * Created on 2023/4/28 16:04.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @desc : com.run.tu.handler.event
 */
@Data
@AllArgsConstructor
public class FollowEvent {

    private Long followingId;

    private Long idFollow;

    private String summary;
}

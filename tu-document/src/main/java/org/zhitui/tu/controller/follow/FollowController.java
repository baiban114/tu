package org.zhitui.tu.controller.follow;

import org.zhitui.tu.core.result.GlobalResult;
import org.zhitui.tu.core.result.GlobalResultGenerator;
import org.zhitui.tu.entity.Follow;
import org.zhitui.tu.entity.User;
import org.zhitui.tu.service.FollowService;
import org.zhitui.tu.util.UserUtils;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;

/**
 * @author ronger
 */
@RestController
@RequestMapping("/api/v1/follow")
public class FollowController {

    @Resource
    private FollowService followService;

    @GetMapping("/is-follow")
    public GlobalResult isFollow(@RequestParam Integer followingId, @RequestParam String followingType) {
        User tokenUser = UserUtils.getCurrentUserByToken();
        Boolean b = followService.isFollow(followingId, followingType, tokenUser.getIdUser());
        return GlobalResultGenerator.genSuccessResult(b);
    }

    @PostMapping
    public GlobalResult<Boolean> follow(@RequestBody Follow follow) {
        User tokenUser = UserUtils.getCurrentUserByToken();
        follow.setFollowerId(tokenUser.getIdUser());
        Boolean b = followService.follow(follow, tokenUser.getNickname());
        return GlobalResultGenerator.genSuccessResult(b);
    }

    @PostMapping("cancel-follow")
    public GlobalResult cancelFollow(@RequestBody Follow follow) {
        User tokenUser = UserUtils.getCurrentUserByToken();
        follow.setFollowerId(tokenUser.getIdUser());
        Boolean b = followService.cancelFollow(follow);
        return GlobalResultGenerator.genSuccessResult(b);
    }


}

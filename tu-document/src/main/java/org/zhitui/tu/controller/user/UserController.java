package org.zhitui.tu.controller.user;

import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import org.zhitui.tu.core.result.GlobalResult;
import org.zhitui.tu.core.result.GlobalResultGenerator;
import org.zhitui.tu.core.service.log.annotation.VisitLogger;
import org.zhitui.tu.dto.ArticleDTO;
import org.zhitui.tu.dto.PortfolioDTO;
import org.zhitui.tu.dto.UserDTO;
import org.zhitui.tu.entity.UserExtend;
import org.zhitui.tu.service.ArticleService;
import org.zhitui.tu.service.FollowService;
import org.zhitui.tu.service.PortfolioService;
import org.zhitui.tu.service.UserService;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.List;

/**
 * @author ronger
 */
@RestController
@RequestMapping("/api/v1/user")
public class UserController {

    @Resource
    private UserService userService;
    @Resource
    private ArticleService articleService;
    @Resource
    private PortfolioService portfolioService;
    @Resource
    private FollowService followService;

    @GetMapping("/{account}")
    @VisitLogger
    public GlobalResult detail(@PathVariable String account) {
        UserDTO userDTO = userService.findUserDTOByAccount(account);
        return GlobalResultGenerator.genSuccessResult(userDTO);
    }

    @GetMapping("/{account}/articles")
    public GlobalResult<PageInfo<ArticleDTO>> userArticles(@RequestParam(defaultValue = "0") Integer page, @RequestParam(defaultValue = "12") Integer rows, @PathVariable String account) {
        UserDTO userDTO = userService.findUserDTOByAccount(account);
        if (userDTO == null) {
            return GlobalResultGenerator.genErrorResult("用户不存在！");
        }
        PageHelper.startPage(page, rows);
        List<ArticleDTO> list = articleService.findUserArticlesByIdUser(userDTO.getIdUser());
        PageInfo<ArticleDTO> pageInfo = new PageInfo(list);
        return GlobalResultGenerator.genSuccessResult(pageInfo);
    }

    @GetMapping("/{account}/portfolios")
    public GlobalResult<PageInfo<PortfolioDTO>> userPortfolios(@RequestParam(defaultValue = "0") Integer page, @RequestParam(defaultValue = "12") Integer rows, @PathVariable String account) {
        UserDTO userDTO = userService.findUserDTOByAccount(account);
        if (userDTO == null) {
            return GlobalResultGenerator.genErrorResult("用户不存在！");
        }
        PageHelper.startPage(page, rows);
        List<PortfolioDTO> list = portfolioService.findUserPortfoliosByUser(userDTO);
        PageInfo<PortfolioDTO> pageInfo = new PageInfo(list);
        return GlobalResultGenerator.genSuccessResult(pageInfo);
    }

    @GetMapping("/{account}/followers")
    public GlobalResult<PageInfo<UserDTO>> userFollowers(@RequestParam(defaultValue = "0") Integer page, @RequestParam(defaultValue = "12") Integer rows, @PathVariable String account) {
        UserDTO userDTO = userService.findUserDTOByAccount(account);
        if (userDTO == null) {
            return GlobalResultGenerator.genErrorResult("用户不存在！");
        }
        PageHelper.startPage(page, rows);
        List<UserDTO> list = followService.findUserFollowersByUser(userDTO);
        PageInfo<UserDTO> pageInfo = new PageInfo(list);
        return GlobalResultGenerator.genSuccessResult(pageInfo);
    }

    @GetMapping("/{account}/followings")
    public GlobalResult<PageInfo<UserDTO>> userFollowings(@RequestParam(defaultValue = "0") Integer page, @RequestParam(defaultValue = "12") Integer rows, @PathVariable String account) {
        UserDTO userDTO = userService.findUserDTOByAccount(account);
        if (userDTO == null) {
            return GlobalResultGenerator.genErrorResult("用户不存在！");
        }
        PageHelper.startPage(page, rows);
        List<UserDTO> list = followService.findUserFollowingsByUser(userDTO);
        PageInfo<UserDTO> pageInfo = new PageInfo(list);
        return GlobalResultGenerator.genSuccessResult(pageInfo);
    }

    @GetMapping("/{account}/user-extend")
    public GlobalResult<UserExtend> userExtend(@PathVariable String account) {
        UserExtend userExtend = userService.selectUserExtendByAccount(account);
        return GlobalResultGenerator.genSuccessResult(userExtend);
    }

}

package com.run.tu.service.impl;

import com.run.tu.core.service.AbstractService;
import com.run.tu.dto.UserDTO;
import com.run.tu.entity.Follow;
import com.run.tu.handler.event.FollowEvent;
import com.run.tu.mapper.FollowMapper;
import com.run.tu.service.FollowService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.util.List;

/**
 * @author ronger
 */
@Service
public class FollowServiceImpl extends AbstractService<Follow> implements FollowService {

    @Resource
    private FollowMapper followMapper;
    @Resource
    private ApplicationEventPublisher applicationEventPublisher;

    @Override
    public Boolean isFollow(Integer followingId, String followingType, Long idUser) {
        return followMapper.isFollow(followingId, idUser, followingType);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Boolean follow(Follow follow, String nickname) {
        int result = followMapper.insertSelective(follow);
        if (result > 0) {
            applicationEventPublisher.publishEvent(new FollowEvent(follow.getFollowingId(), follow.getFollowerId(), nickname + " 关注了你!"));
        }
        return result > 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Boolean cancelFollow(Follow follow) {
        int result = followMapper.delete(follow);
        return result == 0;
    }

    @Override
    public List<Follow> findByFollowingId(String followType, Long followingId) {
        Follow follow = new Follow();
        follow.setFollowingType(followType);
        follow.setFollowingId(followingId);
        return followMapper.select(follow);
    }

    @Override
    public List<UserDTO> findUserFollowersByUser(UserDTO userDTO) {
        return followMapper.selectUserFollowersByUser(userDTO.getIdUser());
    }

    @Override
    public List<UserDTO> findUserFollowingsByUser(UserDTO userDTO) {
        return followMapper.selectUserFollowingsByUser(userDTO.getIdUser());
    }
}

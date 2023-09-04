package com.run.tu.mapper;

import com.run.tu.core.mapper.Mapper;
import com.run.tu.dto.UserDTO;
import com.run.tu.entity.Follow;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * @author ronger
 */
public interface FollowMapper extends Mapper<Follow> {
    /**
     * 判断是否关注
     *
     * @param followingId
     * @param followerId
     * @param followingType
     * @return
     */
    Boolean isFollow(@Param("followingId") Integer followingId, @Param("followerId") Long followerId, @Param("followingType") String followingType);

    /**
     * 查询用户粉丝
     *
     * @param idUser
     * @return
     */
    List<UserDTO> selectUserFollowersByUser(@Param("idUser") Long idUser);

    /**
     * 查询用户关注用户
     *
     * @param idUser
     * @return
     */
    List<UserDTO> selectUserFollowingsByUser(@Param("idUser") Long idUser);
}

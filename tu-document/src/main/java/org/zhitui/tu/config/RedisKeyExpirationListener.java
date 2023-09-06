package org.zhitui.tu.config;

import org.zhitui.tu.auth.JwtConstants;
import org.zhitui.tu.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.listener.KeyExpirationEventMessageListener;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;


/**
 * Created on 2021/10/9 9:25.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @packageName org.zhitui.tu.config
 */
@Slf4j
@Component
public class RedisKeyExpirationListener extends KeyExpirationEventMessageListener {

    @Resource
    private UserService userService;

    @Autowired
    public RedisKeyExpirationListener(RedisMessageListenerContainer listenerContainer) {
        super(listenerContainer);
    }

    /**
     * 针对 redis 数据失效事件，进行数据处理
     *
     * @param message key
     * @param pattern pattern
     */
    @Override
    public void onMessage(Message message, byte[] pattern) {
        // 获取到失效的 key
        String expiredKey = message.toString();
        if (expiredKey.contains(JwtConstants.LAST_ONLINE)) {
            String account = expiredKey.replace(JwtConstants.LAST_ONLINE, "");
            log.info("拿到过期的数据：{}", expiredKey);
            log.info("处理后的数据：{}", account);
            userService.updateLastOnlineTimeByAccount(account);
        }
        super.onMessage(message, pattern);
    }
}

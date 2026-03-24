package com.im.config;

import lombok.Data;
import org.springframework.context.annotation.Configuration;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;

@Configuration
@Data
public class ImConfig implements InitializingBean {

    @Value("${im.groupMessage.timeout}")
    private long timeout;

    @Value("${im.groupMessage.listNum}")
    private long listNum;

    @Value("${im.groupList.updateRate}")
    private int updateRate;

    @Value("${im.group.autoJoin}")
    private int autoJoin;

    @Value("${im.group.loginAuth}")
    private int loginAuth;
    
    private static long TIMEOUT;
    private static long LISTNUM;
    private static int UPDATERATE;
    private static int AUTOJOIN;
    private static int LOGINAUTH;

    @Override
    public void afterPropertiesSet() {
        TIMEOUT = timeout;
        LISTNUM = listNum;
        UPDATERATE = updateRate;
        AUTOJOIN = autoJoin;
        LOGINAUTH = loginAuth;
    }

}

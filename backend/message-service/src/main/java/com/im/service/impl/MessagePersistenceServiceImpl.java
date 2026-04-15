package com.im.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.service.MessagePersistenceService;
import org.springframework.stereotype.Service;

@Service
public class MessagePersistenceServiceImpl extends ServiceImpl<MessageMapper, Message>
        implements MessagePersistenceService {
}

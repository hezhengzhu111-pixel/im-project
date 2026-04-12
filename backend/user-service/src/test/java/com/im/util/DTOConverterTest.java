package com.im.util;

import com.im.dto.FriendRequestDTO;
import com.im.user.entity.FriendRequest;
import com.im.user.entity.User;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DTOConverterTest {

    private final DTOConverter converter = new DTOConverter();

    @Test
    void toFriendRequestDTO_ShouldPopulateTargetAvatar() {
        FriendRequest request = new FriendRequest();
        request.setId(10L);
        request.setApplicantId(1L);
        request.setTargetUserId(2L);
        request.setStatus(0);
        request.setApplyReason("hello");
        request.setApplyTime(LocalDateTime.now());

        User applicant = new User();
        applicant.setId(1L);
        applicant.setUsername("alice");
        applicant.setNickname("Alice");
        applicant.setAvatar("alice.png");

        User target = new User();
        target.setId(2L);
        target.setUsername("bob");
        target.setNickname("Bob");
        target.setAvatar("bob.png");

        FriendRequestDTO dto = converter.toFriendRequestDTO(request, applicant, target);

        assertEquals("bob.png", dto.getTargetAvatar());
        assertEquals("alice.png", dto.getApplicantAvatar());
        assertEquals("bob", dto.getTargetUsername());
    }
}

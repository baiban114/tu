package com.studyflow.note;

import com.studyflow.common.BusinessException;
import com.studyflow.common.StudyflowConstants;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Personal free-form note use cases.
 */
@Service
public class PersonalNoteService {

    private static final int NOT_FOUND_CODE = 40_404;

    private final PersonalNoteRepository repository;

    public PersonalNoteService(PersonalNoteRepository repository) {
        this.repository = repository;
    }

    public PersonalNotePage list(String userId, int page, int pageSize) {
        String uid = normalizeUserId(userId);
        int safePage = Math.max(page, 0);
        int safeSize = clampPageSize(pageSize);
        long total = repository.countByUserId(uid);
        int offset = safePage * safeSize;
        List<PersonalNote> items = repository.findByUserId(uid, safeSize, offset);
        return new PersonalNotePage(items, total, safePage, safeSize);
    }

    public PersonalNote get(String userId, String id) {
        return repository.findByIdAndUserId(id, normalizeUserId(userId))
                .orElseThrow(() -> new BusinessException(NOT_FOUND_CODE, "note not found"));
    }

    public PersonalNote create(String userId, String body) {
        String trimmed = requireBody(body);
        OffsetDateTime now = OffsetDateTime.now();
        PersonalNote note = new PersonalNote(
                UUID.randomUUID().toString(),
                normalizeUserId(userId),
                trimmed,
                now,
                now
        );
        repository.insert(note);
        return note;
    }

    public PersonalNote update(String userId, String id, String body) {
        String uid = normalizeUserId(userId);
        String trimmed = requireBody(body);
        OffsetDateTime now = OffsetDateTime.now();
        boolean ok = repository.updateBody(id, uid, trimmed, now);
        if (!ok) {
            throw new BusinessException(NOT_FOUND_CODE, "note not found");
        }
        return get(uid, id);
    }

    public void delete(String userId, String id) {
        boolean ok = repository.deleteByIdAndUserId(id, normalizeUserId(userId));
        if (!ok) {
            throw new BusinessException(NOT_FOUND_CODE, "note not found");
        }
    }

    private static String normalizeUserId(String userId) {
        if (!StringUtils.hasText(userId)) {
            return StudyflowConstants.DEFAULT_USER_ID;
        }
        return userId.trim();
    }

    private static int clampPageSize(int pageSize) {
        if (pageSize <= 0) {
            return StudyflowConstants.DEFAULT_PAGE_SIZE;
        }
        return Math.min(pageSize, StudyflowConstants.MAX_PAGE_SIZE);
    }

    private static String requireBody(String body) {
        if (!StringUtils.hasText(body)) {
            throw new BusinessException("body must not be blank");
        }
        return body.trim();
    }
}

package com.studyflow.note;

import com.studyflow.common.ApiResponse;
import com.studyflow.common.StudyflowConstants;
import jakarta.validation.Valid;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST API for personal free-form text notes.
 */
@RestController
@RequestMapping("/api/learning/notes")
public class PersonalNoteController {

    private final PersonalNoteService personalNoteService;

    public PersonalNoteController(PersonalNoteService personalNoteService) {
        this.personalNoteService = personalNoteService;
    }

    @GetMapping
    public ApiResponse<PersonalNotePage> list(
            @RequestHeader(value = StudyflowConstants.USER_ID_HEADER, required = false) String userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int pageSize
    ) {
        return ApiResponse.ok(personalNoteService.list(resolveUserId(userId), page, pageSize));
    }

    @GetMapping("/{id}")
    public ApiResponse<PersonalNote> get(
            @RequestHeader(value = StudyflowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String id
    ) {
        return ApiResponse.ok(personalNoteService.get(resolveUserId(userId), id));
    }

    @PostMapping
    public ApiResponse<PersonalNote> create(
            @RequestHeader(value = StudyflowConstants.USER_ID_HEADER, required = false) String userId,
            @Valid @RequestBody PersonalNoteUpsertRequest request
    ) {
        return ApiResponse.ok(personalNoteService.create(resolveUserId(userId), request.body()));
    }

    @PutMapping("/{id}")
    public ApiResponse<PersonalNote> update(
            @RequestHeader(value = StudyflowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String id,
            @Valid @RequestBody PersonalNoteUpsertRequest request
    ) {
        return ApiResponse.ok(personalNoteService.update(resolveUserId(userId), id, request.body()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(
            @RequestHeader(value = StudyflowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String id
    ) {
        personalNoteService.delete(resolveUserId(userId), id);
        return ApiResponse.ok(null);
    }

    private static String resolveUserId(String headerValue) {
        if (!StringUtils.hasText(headerValue)) {
            return StudyflowConstants.DEFAULT_USER_ID;
        }
        return headerValue.trim();
    }
}

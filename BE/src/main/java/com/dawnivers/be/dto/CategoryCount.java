package com.dawnivers.be.dto;

public record CategoryCount(
        String category,
        Long cnt          // count(*) 是 bigint → Long
) { }
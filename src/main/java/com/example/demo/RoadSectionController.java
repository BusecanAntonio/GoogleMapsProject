package com.example.demo;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/roads")
public class RoadSectionController {

    @Autowired
    private RoadSectionRepository repository;

    @GetMapping
    public List<RoadSection> getAllRoads() {
        return repository.findAll();
    }

    @PostMapping
    public RoadSection addRoad(@RequestBody RoadSection road) {
        return repository.save(road);
    }
}

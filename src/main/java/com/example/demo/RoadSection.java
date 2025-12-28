package com.example.demo;

import jakarta.persistence.*;

@Entity
public class RoadSection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String type; // Ex: "blocked", "work_in_progress", "default"

    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String coordinatesJson;

    public RoadSection() {}

    public RoadSection(String name, String type, String coordinatesJson) {
        this.name = name;
        this.type = type;
        this.coordinatesJson = coordinatesJson;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getType() { return type; }
    public String getCoordinatesJson() { return coordinatesJson; }

    public void setName(String name) { this.name = name; }
    public void setType(String type) { this.type = type; }
    public void setCoordinatesJson(String coordinatesJson) { this.coordinatesJson = coordinatesJson; }
}

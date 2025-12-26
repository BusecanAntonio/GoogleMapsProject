package com.example.demo;

import jakarta.persistence.*;

@Entity
public class RoadSection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    // Folosim LONGTEXT pentru a putea stoca rute foarte lungi
    // In MySQL, TEXT e 64KB, MEDIUMTEXT e 16MB, LONGTEXT e 4GB
    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String coordinatesJson;

    public RoadSection() {}

    public RoadSection(String name, String coordinatesJson) {
        this.name = name;
        this.coordinatesJson = coordinatesJson;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getCoordinatesJson() { return coordinatesJson; }

    public void setName(String name) { this.name = name; }
    public void setCoordinatesJson(String coordinatesJson) { this.coordinatesJson = coordinatesJson; }
}

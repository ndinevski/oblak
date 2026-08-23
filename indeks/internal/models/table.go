// Package models defines Indeks's core types: tables, their key schema, and the
// items stored in them.
//
// Indeks is a key/value and document store in the shape of DynamoDB. A table
// has a partition key and, optionally, a sort key; an item is a JSON object
// that must contain those key attributes. The pair (partition, sort) uniquely
// identifies an item, and items sharing a partition key are stored in sort-key
// order so a range query over one partition is cheap.
package models

import (
	"fmt"
	"regexp"
	"strings"
)

// KeyType is the data type of a key attribute. DynamoDB allows string, number
// and binary; Indeks supports string and number, which cover the vast majority
// of real key schemas and keep ordering well-defined.
type KeyType string

const (
	KeyTypeString KeyType = "S"
	KeyTypeNumber KeyType = "N"
)

// KeySchema describes a table's primary key.
type KeySchema struct {
	// PartitionKey is the attribute every item is grouped by. Required.
	PartitionKey  string  `json:"partition_key"`
	PartitionType KeyType `json:"partition_type"`

	// SortKey is optional. When set, (partition, sort) is the composite primary
	// key and items in a partition are ordered by it.
	SortKey  string  `json:"sort_key,omitempty"`
	SortType KeyType `json:"sort_type,omitempty"`
}

// HasSortKey reports whether the table uses a composite key.
func (k KeySchema) HasSortKey() bool { return k.SortKey != "" }

// Table is a collection of items sharing one key schema.
type Table struct {
	Name      string    `json:"name"`
	Keys      KeySchema `json:"keys"`
	ItemCount int64     `json:"item_count"`
	SizeBytes int64     `json:"size_bytes"`
	CreatedAt string    `json:"created_at"`
}

// tableNameRe constrains a table name: it is used as a bbolt bucket name and in
// URLs, so it is kept to a safe, readable set.
var tableNameRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{1,254}$`)

// attrNameRe constrains a key attribute name.
var attrNameRe = regexp.MustCompile(`^[a-zA-Z0-9_.-]{1,255}$`)

// CreateTableRequest is the body of a table-creation call.
type CreateTableRequest struct {
	Name          string  `json:"name"`
	PartitionKey  string  `json:"partition_key"`
	PartitionType KeyType `json:"partition_type,omitempty"`
	SortKey       string  `json:"sort_key,omitempty"`
	SortType      KeyType `json:"sort_type,omitempty"`
}

// Validate checks the request and returns the resolved key schema.
func (r *CreateTableRequest) Validate() (*KeySchema, error) {
	r.Name = strings.TrimSpace(r.Name)
	if !tableNameRe.MatchString(r.Name) {
		return nil, &ValidationError{
			Field:   "name",
			Message: "name must be 2-255 characters of letters, digits, and . _ -, starting with a letter or digit",
		}
	}

	pk := strings.TrimSpace(r.PartitionKey)
	if !attrNameRe.MatchString(pk) {
		return nil, &ValidationError{Field: "partition_key", Message: "a valid partition key attribute name is required"}
	}
	pt := r.PartitionType
	if pt == "" {
		pt = KeyTypeString
	}
	if err := validKeyType("partition_type", pt); err != nil {
		return nil, err
	}

	schema := &KeySchema{PartitionKey: pk, PartitionType: pt}

	if sk := strings.TrimSpace(r.SortKey); sk != "" {
		if !attrNameRe.MatchString(sk) {
			return nil, &ValidationError{Field: "sort_key", Message: "sort key is not a valid attribute name"}
		}
		if sk == pk {
			return nil, &ValidationError{Field: "sort_key", Message: "sort key must differ from the partition key"}
		}
		st := r.SortType
		if st == "" {
			st = KeyTypeString
		}
		if err := validKeyType("sort_type", st); err != nil {
			return nil, err
		}
		schema.SortKey = sk
		schema.SortType = st
	}

	return schema, nil
}

func validKeyType(field string, t KeyType) error {
	switch t {
	case KeyTypeString, KeyTypeNumber:
		return nil
	}
	return &ValidationError{Field: field, Message: fmt.Sprintf("type must be %q (string) or %q (number)", KeyTypeString, KeyTypeNumber)}
}

// IsValidTableName reports whether a name is safe to use, for path parameters.
func IsValidTableName(name string) bool {
	return tableNameRe.MatchString(name)
}

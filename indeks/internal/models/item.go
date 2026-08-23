package models

import (
	"fmt"
	"math"
	"strconv"
)

// Item is a stored record: an arbitrary JSON object that must contain the
// table's key attributes. Values may be any JSON type; only the key attributes
// are constrained (they must be present and match the schema's type).
type Item map[string]interface{}

// PutItemRequest is the body of a put. The whole item replaces any existing
// item with the same key, as DynamoDB PutItem does.
type PutItemRequest struct {
	Item Item `json:"item"`
}

// QueryRequest reads the items of one partition, optionally narrowed by a sort
// key condition. This is the cheap access path: it touches only one partition.
type QueryRequest struct {
	// PartitionValue is the partition key to read. Required.
	PartitionValue interface{} `json:"partition_value"`

	// Sort narrows the result within the partition by the sort key. Optional;
	// ignored on a table without a sort key.
	Sort *SortCondition `json:"sort,omitempty"`

	// Limit caps the number of items returned. Zero means the server default.
	Limit int `json:"limit,omitempty"`

	// Descending returns items in reverse sort-key order.
	Descending bool `json:"descending,omitempty"`
}

// SortConditionOp is a comparison against the sort key.
type SortConditionOp string

const (
	SortEq      SortConditionOp = "eq"
	SortLt      SortConditionOp = "lt"
	SortLte     SortConditionOp = "lte"
	SortGt      SortConditionOp = "gt"
	SortGte     SortConditionOp = "gte"
	SortBetween SortConditionOp = "between"
	SortPrefix  SortConditionOp = "begins_with"
)

// SortCondition narrows a query by the sort key.
type SortCondition struct {
	Op    SortConditionOp `json:"op"`
	Value interface{}     `json:"value"`
	// Value2 is the upper bound for "between".
	Value2 interface{} `json:"value2,omitempty"`
}

// keyValueString renders a key attribute value as the canonical string used to
// build the storage key. For numbers this is a fixed-width, order-preserving
// encoding so that numeric sort keys sort numerically, not lexically; for
// strings it is the string itself.
func keyValueString(v interface{}, t KeyType) (string, error) {
	switch t {
	case KeyTypeString:
		s, ok := v.(string)
		if !ok {
			return "", fmt.Errorf("expected a string key value, got %T", v)
		}
		return s, nil
	case KeyTypeNumber:
		f, err := toFloat(v)
		if err != nil {
			return "", err
		}
		return encodeNumber(f), nil
	}
	return "", fmt.Errorf("unknown key type %q", t)
}

func toFloat(v interface{}) (float64, error) {
	switch n := v.(type) {
	case float64:
		return n, nil
	case float32:
		return float64(n), nil
	case int:
		return float64(n), nil
	case int64:
		return float64(n), nil
	case json_Number:
		return n.Float64()
	case string:
		// Accept a numeric string, since JSON clients sometimes send numbers
		// quoted to preserve precision.
		f, err := strconv.ParseFloat(n, 64)
		if err != nil {
			return 0, fmt.Errorf("expected a number key value, got %q", n)
		}
		return f, nil
	}
	return 0, fmt.Errorf("expected a number key value, got %T", v)
}

// json_Number lets the store accept json.Number without importing encoding/json
// into this file's signature; it is an interface the decoder's Number satisfies.
type json_Number interface {
	Float64() (float64, error)
	String() string
}

// encodeNumber turns a float64 into an order-preserving fixed-width string, so
// bbolt's byte-ordered keys sort numerically. The scheme:
//   - a sign/magnitude prefix keeps negatives before positives,
//   - the magnitude is written zero-padded with a fixed number of digits.
//
// This is not meant to round-trip the exact value (the item body holds that);
// it only has to order correctly and be stable for equality.
func encodeNumber(f float64) string {
	if math.IsNaN(f) {
		f = 0
	}
	// Offset-binary style: map the whole float range onto an ordered space by
	// formatting with a large fixed exponent width. Simpler and robust enough
	// for key ordering: sign flag + 20.10f zero-padded.
	sign := "1" // positive sorts after negative
	mag := f
	if f < 0 {
		sign = "0"
		mag = -f
	}
	s := strconv.FormatFloat(mag, 'f', 10, 64)
	// Zero-pad the integer part to a fixed width so lexical order matches
	// numeric order within a sign.
	dot := len(s)
	for i := 0; i < len(s); i++ {
		if s[i] == '.' {
			dot = i
			break
		}
	}
	intPart := s[:dot]
	frac := s[dot:]
	const width = 20
	for len(intPart) < width {
		intPart = "0" + intPart
	}
	encoded := sign + intPart + frac
	if sign == "0" {
		// For negatives, invert so that larger magnitude sorts earlier.
		encoded = sign + invertDigits(intPart) + invertDigits(frac)
	}
	return encoded
}

// invertDigits maps each digit d to 9-d (leaving the dot), so a larger negative
// magnitude produces a smaller string, giving correct descending order among
// negatives.
func invertDigits(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= '0' && b[i] <= '9' {
			b[i] = '0' + ('9' - b[i])
		}
	}
	return string(b)
}

// ExtractKey pulls the partition (and sort, if any) value from an item and
// validates their presence and type, returning their encoded key strings.
func (s KeySchema) ExtractKey(item Item) (partition string, sort string, err error) {
	pv, ok := item[s.PartitionKey]
	if !ok {
		return "", "", &ValidationError{Field: "item", Message: fmt.Sprintf("item is missing the partition key %q", s.PartitionKey)}
	}
	partition, err = keyValueString(pv, s.PartitionType)
	if err != nil {
		return "", "", &ValidationError{Field: s.PartitionKey, Message: err.Error()}
	}

	if s.HasSortKey() {
		sv, ok := item[s.SortKey]
		if !ok {
			return "", "", &ValidationError{Field: "item", Message: fmt.Sprintf("item is missing the sort key %q", s.SortKey)}
		}
		sort, err = keyValueString(sv, s.SortType)
		if err != nil {
			return "", "", &ValidationError{Field: s.SortKey, Message: err.Error()}
		}
	}
	return partition, sort, nil
}

// EncodePartition encodes a raw partition value for lookup.
func (s KeySchema) EncodePartition(v interface{}) (string, error) {
	return keyValueString(v, s.PartitionType)
}

// EncodeSort encodes a raw sort value for lookup.
func (s KeySchema) EncodeSort(v interface{}) (string, error) {
	return keyValueString(v, s.SortType)
}

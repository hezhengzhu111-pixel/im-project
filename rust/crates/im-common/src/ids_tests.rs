#[cfg(test)]
mod ids_tests {
    use crate::ids::next_id;

    #[test]
    fn generates_positive_ids() {
        let id = next_id(0);
        assert!(id > 0, "expected positive id, got {id}");
    }

    #[test]
    fn generates_unique_ids() {
        let id1 = next_id(0);
        let id2 = next_id(0);
        assert_ne!(id1, id2, "consecutive ids must be unique");
    }

    #[test]
    fn ids_are_monotonically_increasing() {
        let mut prev = next_id(0);
        for _ in 0..100 {
            let curr = next_id(0);
            assert!(curr > prev, "ids must increase: prev={prev}, curr={curr}");
            prev = curr;
        }
    }

    #[test]
    fn different_node_ids_produce_different_id_ranges() {
        let id_a = next_id(0);
        let id_b = next_id(1);
        assert_ne!(
            id_a, id_b,
            "different nodes should produce distinguishable ids"
        );
    }

    #[test]
    fn node_id_is_reflected_in_id() {
        let id = next_id(42);
        let extracted_node = ((id >> 12) & 0x03ff) as u16;
        assert_eq!(
            extracted_node, 42,
            "node id should be encoded in bits 12-21"
        );
    }

    #[test]
    fn node_id_clamped_to_10_bits() {
        let id = next_id(0xffff); // node > 10 bits, should be clamped
        let extracted_node = ((id >> 12) & 0x03ff) as u16;
        assert_eq!(
            extracted_node, 0x03ff,
            "node id should be masked to 10 bits"
        );
    }

    #[test]
    fn generates_many_unique_ids_rapidly() {
        let mut ids: Vec<i64> = Vec::with_capacity(1000);
        for _ in 0..1000 {
            ids.push(next_id(0));
        }
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), 1000, "all 1000 ids must be unique");
    }
}

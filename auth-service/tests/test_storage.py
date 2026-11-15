import pytest

from app.storage import LocalStorage


def test_put_get_exists_delete(tmp_path):
    storage = LocalStorage(tmp_path)
    assert not storage.exists("photos/original/20u0001")
    storage.put("photos/original/20u0001", b"data", "image/png")
    assert storage.exists("photos/original/20u0001")
    assert storage.get("photos/original/20u0001") == b"data"
    storage.delete("photos/original/20u0001")
    assert not storage.exists("photos/original/20u0001")


def test_delete_missing_key_is_not_an_error(tmp_path):
    LocalStorage(tmp_path).delete("photos/thumb/nothing.jpg")


def test_url_is_none_in_local_mode(tmp_path):
    assert LocalStorage(tmp_path).url("photos/original/20u0001") is None


@pytest.mark.parametrize("key", ["../outside", "photos/../../outside", "/etc/passwd"])
def test_keys_cannot_leave_the_directory(tmp_path, key):
    storage = LocalStorage(tmp_path / "root")
    with pytest.raises(ValueError):
        storage.put(key, b"x", "image/png")
